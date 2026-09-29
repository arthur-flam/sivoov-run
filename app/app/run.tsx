import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { aheadOf, constantPace, finishOutcome, formatKm, gpsSignal, lightPresetAt, parsePace, progress, readableOn } from '@sivoov/shared';
import type { Course, CourseTrack, LightPreset } from '@sivoov/shared';
import type { CeremonyHandlers } from '@/audio/ceremony';
import { usePackStore } from '@/audio/packStore';
import { captionFor, useSaid } from '@/audio/said';
import { useAudioPack, useAudioPlayback } from '@/audio/usePlayback';
import { Finish } from '@/components/Finish';
import { Announcements } from '@/components/run/Announcements';
import { Caption } from '@/components/run/Caption';
import { CountdownDigit } from '@/components/run/CountdownDigit';
import { LivePanel } from '@/components/run/LivePanel';
import { ReadyPanel } from '@/components/run/ReadyPanel';
import { Stage } from '@/components/run/Stage';
import { StartPanel } from '@/components/run/StartPanel';
import { StatusChips } from '@/components/run/StatusChips';
import { StopConfirm } from '@/components/run/StopConfirm';
import { Body, Screen } from '@/components/ui';
import { useCaption } from '@/hooks/useCaption';
import { useGlide } from '@/hooks/useGlide';
import { useMapDownload } from '@/hooks/useMapDownload';
import { useTrack } from '@/hooks/useTrack';
import { diag, useDiag } from '@/diag';
import { locale, t } from '@/i18n';
import { deviceSource, simulationSource } from '@/services/location';
import { usePrefs } from '@/stores/prefs';
import type { MapView } from '@/stores/prefs';
import { useRun } from '@/stores/run';
import { useSession } from '@/stores/session';
import { newRunId, toUpload, useUploads } from '@/stores/uploads';
import { colors, space } from '@/theme';

/**
 * The screen stays on during the run, on a phone. Not on the web target (development and the
 * screenshot rig), where the browser's wake lock throws when a reload unmounts it before it took.
 */
const useStayAwake: () => void = Platform.OS === 'web' ? () => undefined : useKeepAwake;

const VIEWS: MapView[] = ['follow', 'overview', 'numbers'];
const nextView = (view: MapView): MapView => VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]!;

/** The map's light for the course's start, now, checked again every few minutes (a marathon can run into the night). */
const useLight = (track: CourseTrack | null): LightPreset => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  return track ? lightPresetAt(track.points[0]!, now) : 'day';
};

/** « 42,195 km », « 21,1 km », « 10 km »: the course's distance as the race names it. */
const courseLabel = (course: Course) => formatKm(course.distanceM, locale, course.distanceKey === 'marathon' ? 3 : course.distanceM % 1000 === 0 ? 0 : 1);

export default function Run() {
  useStayAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sim?: string; pace?: string; speed?: string; noise?: string }>();
  const me = useSession((s) => s.me);
  const course = me?.course ?? null;
  const race = me?.race ?? null;
  const track = useTrack(course);
  const pack = useAudioPack(course);
  useAudioPlayback();
  const run = useRun();
  const token = useSession((s) => s.token);
  const runId = useRef(newRunId());
  const uploadStatus = useUploads((s) => s.statusOf(runId.current));
  const prefs = usePrefs();
  const said = useSaid();
  const caption = useCaption();
  const [sheet, setSheet] = useState<'said' | 'stop' | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const onMapFail = useCallback(() => setMapFailed(true), []);
  const mapToken = me?.map?.token ?? null;
  const mapDownload = useMapDownload(course?.id ?? null, track, mapToken);
  const light = useLight(track);
  const glided = useGlide(run.state, run.phase === 'running');
  const ceremonyLine = useRef<string | null>(null);

  useEffect(() => {
    void usePrefs.getState().load();
    useSaid.getState().reset();
    return () => useSaid.getState().reset();
  }, []);

  // Prepare whenever the inputs settle; the store ignores it once the countdown has begun, so
  // the published pack landing after Start (it replaces the bundled one) never wipes the run.
  useEffect(() => {
    if (course && track && pack) run.prepare(course, track, pack);
  }, [course, track, pack]);
  useEffect(() => () => useRun.getState().reset(), []);

  // Android's back button would unmount the screen and drop the run: during the run it asks to
  // stop, like the stop control; during the countdown it does nothing.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const phase = useRun.getState().phase;
      if (phase === 'running') setSheet((open) => (open ? null : 'stop'));
      return phase === 'countdown' || phase === 'running';
    });
    return () => sub.remove();
  }, []);

  // The gun: a firm tap on the phone as the clock starts, for a runner not looking at the screen.
  useEffect(() => {
    if (run.phase === 'running' && Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    if (run.phase !== 'running') setSheet(null);
  }, [run.phase]);

  // The finish path: queue the run and its trace; the store sends it now or when back online.
  useEffect(() => {
    if (run.phase !== 'finished' || !course || !me) return;
    const { state, samples, fired, source: used } = useRun.getState();
    const device = { platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web', osVersion: String(Platform.Version ?? ''), appVersion: Constants.expoConfig?.version } as const;
    diag('run', `finished: ${state.accepted} accepted, ${state.rejected} rejected, ${samples.length} samples, ${Math.round(state.distanceM)} m`);
    const upload = toUpload({ id: runId.current, entrantId: me.entrant.id, courseId: course.id, state, samples, fired, source: used?.kind === 'simulation' ? 'simulation' : 'app', device, finishedAtMs: used?.now() ?? Date.now(), diagnostics: useDiag.getState().snapshot() });
    void useUploads.getState().enqueue(upload, token).catch(() => undefined);
  }, [run.phase]);

  const source = useMemo(() => {
    if (!track || !course) return null;
    // Simulation is a development tool (web target, dev client): a release build ignores ?sim,
    // so no deep link can put a made-up finish, with its Share button, on a runner's phone.
    if (params.sim && __DEV__) {
      const pace = parsePace(params.pace ?? '') ?? 330;
      return simulationSource({ track, targetM: course.distanceM, pace: constantPace(pace), speedFactor: Number(params.speed ?? 1) || 1, noiseM: Number(params.noise ?? 4) });
    }
    return deviceSource();
  }, [track, course, params.sim, params.pace, params.speed, params.noise]);

  if (!course || !race || !track || !source) {
    return (
      <Screen dark style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <Body dark>{t('common.loading')}</Body>
      </Screen>
    );
  }

  const { state, phase } = run;
  if (phase === 'finished' && me) {
    const outcome = finishOutcome({ distanceM: state.distanceM, courseDistanceM: course.distanceM, startedAtMs: state.startedAt ?? 0, window: source.kind === 'simulation' ? null : race });
    return (
      <Screen dark style={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom }}>
        <StatusBar style="light" />
        <Finish
          race={race}
          course={course}
          entrant={me.entrant}
          state={state}
          outcome={outcome}
          simulation={source.kind === 'simulation'}
          uploadStatus={uploadStatus}
          onHome={() => router.dismissTo('/home')}
          onDiagnostics={() => router.push('/debug')}
        />
      </Screen>
    );
  }

  // The race colour lifted to read on the night ground: Deauville's navy vanished on black.
  const accent = readableOn(race.theme.primary, colors.night);
  const simulation = source.kind === 'simulation';
  const mapShown = mapToken !== null && !mapFailed;
  const view = phase === 'idle' ? 'overview' : phase === 'countdown' ? 'follow' : prefs.view;
  // Room for the chips (and, over the course drawing, the caption under them).
  const topInset = insets.top + 132;

  // Each line of the start ceremony as it plays: its words on screen and in the list.
  const onLine: CeremonyHandlers['onLine'] = (line) => {
    const saidNow = useSaid.getState();
    if (!line) {
      if (saidNow.speaking === ceremonyLine.current) saidNow.setSpeaking(null);
      return;
    }
    ceremonyLine.current = line.event.id;
    saidNow.add({ key: `cue:${line.event.id}`, event: line.event, text: captionFor(line.event, usePackStore.getState().captions), distanceM: 0, elapsedMs: 0, sound: 'heard', uri: line.uri, at: Date.now() });
    saidNow.setSpeaking(line.event.id);
  };
  const start = () => void run.start(source, { soundFor: usePackStore.getState().soundFor, uriFor: usePackStore.getState().uriFor, onLine });

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.stage}>
        <Stage token={mapShown ? mapToken : null} track={track} course={course} runM={glided} accent={accent} view={view} light={light} failed={mapFailed} onFail={onMapFail} topInset={topInset} />
        <View style={[styles.chips, { paddingTop: insets.top + space.sm }]}>
          <StatusChips race={race.theme.displayName} gps={phase === 'running' ? gpsSignal(run.samples[run.samples.length - 1] ?? null, source.now()) : null} simulation={simulation && phase !== 'idle'} />
        </View>
        {phase === 'countdown' && run.cue !== 'armed' ? (
          <View style={styles.countdown} pointerEvents="none">
            <CountdownDigit value={Math.max(1, run.countdown)} />
          </View>
        ) : null}
        {phase === 'running' ? (
          <View style={[styles.caption, { top: insets.top + 56 }]}>
            <Caption line={caption.line} speaking={caption.speaking} onPress={() => setSheet('said')} />
          </View>
        ) : null}
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.seam}>
          <View style={[styles.seamFill, { width: `${progress(state) * 100}%`, backgroundColor: accent }]} />
        </View>
        {phase === 'idle' ? (
          <ReadyPanel
            who={`${me?.entrant.firstName ?? ''} · ${courseLabel(course)}`}
            error={run.startError}
            simulation={simulation ? `${t('run.sim.badge')} · ${params.pace ?? '5:30'} /km · ×${params.speed ?? 1}` : null}
            map={mapDownload}
            color={race.theme.primary}
            onColor={race.theme.onPrimary}
            onStart={start}
            onBack={() => router.back()}
          />
        ) : phase === 'countdown' ? (
          <StartPanel cue={run.cue === 'armed' ? 'armed' : 'digits'} who={`${me?.entrant.firstName ?? ''} · ${courseLabel(course)}`} line={caption.line} speaking={caption.speaking} />
        ) : (
          <LivePanel
            state={state}
            ofLabel={courseLabel(course)}
            ahead={aheadOf(course.landmarks, course.distanceM, state.distanceM)}
            accent={accent}
            voice={t(`run.voice.${prefs.voice}`)}
            view={mapShown ? prefs.view : null}
            onAnnouncements={() => setSheet('said')}
            onView={() => prefs.setView(nextView(prefs.view))}
            onStop={() => setSheet('stop')}
          />
        )}
      </View>

      {sheet === 'said' ? <Announcements lines={said.lines} speaking={said.speaking} level={prefs.voice} onLevel={prefs.setVoice} onClose={() => setSheet(null)} /> : null}
      {sheet === 'stop' ? (
        <StopConfirm
          distance={formatKm(state.distanceM, locale)}
          onKeep={() => setSheet(null)}
          onStop={() => {
            setSheet(null);
            void run.stop();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md },
  stage: { flex: 1, overflow: 'hidden' },
  chips: { position: 'absolute', top: 0, left: space.md, right: space.md },
  countdown: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,12,12,0.35)' },
  // Under the chips, over the sky of the followed view: the runner and the road ahead stay clear,
  // and so do the map's logo and attribution at the bottom.
  caption: { position: 'absolute', left: space.sm, right: space.sm },
  panel: { backgroundColor: colors.night, paddingHorizontal: space.md, paddingTop: space.md },
  seam: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: colors.nightBorder },
  seamFill: { height: 3 },
});
