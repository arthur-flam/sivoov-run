import { useEffect, useMemo, useRef } from 'react';
import { BackHandler, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import Constants from 'expo-constants';
import { constantPace, finishOutcome, formatClock, formatKm, formatPace, nextLandmark, parsePace, progress, readableOn } from '@sivoov/shared';
import { usePackStore } from '@/audio/packStore';
import { useAudioPack, useAudioPlayback } from '@/audio/usePlayback';
import { CourseDiagram } from '@/components/CourseDiagram';
import { Finish } from '@/components/Finish';
import { Body, Button, Card, Display, Eyebrow, Num, Screen } from '@/components/ui';
import { useTrack } from '@/hooks/useTrack';
import { diag, useDiag } from '@/diag';
import { locale, t } from '@/i18n';
import { deviceSource, simulationSource } from '@/services/location';
import { useRun } from '@/stores/run';
import { useSession } from '@/stores/session';
import { newRunId, toUpload, useUploads } from '@/stores/uploads';
import { colors, fonts, space } from '@/theme';

export default function Run() {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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

  // Prepare whenever the inputs settle; the store ignores it once the countdown has begun, so
  // the published pack landing after Start (it replaces the bundled one) never wipes the run.
  useEffect(() => {
    if (course && track && pack) run.prepare(course, track, pack);
  }, [course, track, pack]);
  useEffect(() => () => useRun.getState().reset(), []);

  // Android's back button would unmount the screen and drop the run: only the long press stops it.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => ['countdown', 'running'].includes(useRun.getState().phase));
    return () => sub.remove();
  }, []);

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
    if (params.sim) {
      const pace = parsePace(params.pace ?? '') ?? 330;
      return simulationSource({ track, targetM: course.distanceM, pace: constantPace(pace), speedFactor: Number(params.speed ?? 1) || 1, noiseM: Number(params.noise ?? 4) });
    }
    return deviceSource();
  }, [track, course, params.sim, params.pace, params.speed, params.noise]);

  if (!course || !race || !track || !source) {
    return (
      <Screen dark style={[styles.center, { paddingTop: insets.top }]}>
        <Body dark>{t('common.loading')}</Body>
      </Screen>
    );
  }

  // The race colour lifted to read on the night ground: Deauville's navy vanished on black.
  const accent = readableOn(race.theme.primary, colors.night);
  const { state, phase } = run;
  const next = nextLandmark(course.landmarks, state.distanceM);
  const diagramW = Math.min(width - 2 * space.md, 420);

  if (phase === 'idle') {
    return (
      <Screen dark style={{ paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg, gap: space.md }}>
        <Eyebrow dark>{race.theme.displayName}</Eyebrow>
        <Display dark>{t('run.ready')}</Display>
        <Body dark muted>
          {me?.entrant.firstName} · {formatKm(course.distanceM, locale, course.distanceKey === 'marathon' ? 3 : 1)}
        </Body>
        {run.startError ? <Body dark testID="start-error">{run.startError === 'location_denied' ? t('prepare.check.permission.denied') : t('run.startFailed')}</Body> : null}
        {source.kind === 'simulation' ? <Body dark muted testID="sim-badge">{t('run.sim.badge')} · {params.pace ?? '5:30'} /km · ×{params.speed ?? 1}</Body> : null}
        <View style={{ alignItems: 'center', paddingVertical: space.md }}>
          <CourseDiagram track={track} officialM={course.distanceM} runM={0} landmarks={course.landmarks} accent={accent} width={diagramW} height={diagramW * 0.8} />
        </View>
        <View style={{ flex: 1 }} />
        <Button testID="start" label={t('run.start')} color={race.theme.primary} onColor={race.theme.onPrimary} onPress={() => void run.start(source, { uriFor: usePackStore.getState().uriFor })} />
        <Button label={t('common.back')} ghost dark onPress={() => router.back()} />
      </Screen>
    );
  }

  // The ceremony's first lines: no digits yet, the runner is on the line and listening.
  if (phase === 'countdown' && run.cue === 'armed') {
    return (
      <Screen dark style={[styles.center, { padding: space.lg }]}>
        <Eyebrow dark>{race.theme.displayName}</Eyebrow>
        <Display dark style={{ textAlign: 'center' }}>{t('run.armed.title')}</Display>
        <Body dark muted style={{ textAlign: 'center' }} testID="on-the-line">
          {t('run.armed.body')}
        </Body>
      </Screen>
    );
  }

  if (phase === 'countdown') {
    return (
      <Screen dark style={styles.center}>
        <Body dark muted>{t('run.countdown')}</Body>
        <Num dark size={200} testID="countdown">{Math.max(1, run.countdown)}</Num>
      </Screen>
    );
  }

  if (phase === 'finished' && me) {
    const outcome = finishOutcome({ distanceM: state.distanceM, courseDistanceM: course.distanceM, startedAtMs: state.startedAt ?? 0, window: source.kind === 'simulation' ? null : race });
    return (
      <Screen dark style={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom }}>
        <Finish
          race={race}
          course={course}
          entrant={me.entrant}
          track={track}
          state={state}
          outcome={outcome}
          accent={accent}
          simulation={source.kind === 'simulation'}
          uploadStatus={uploadStatus}
          onHome={() => router.dismissTo('/home')}
          onDiagnostics={() => router.push('/debug')}
        />
      </Screen>
    );
  }

  return (
    <Screen dark style={{ paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md }}>
      <View style={[styles.progressTrack]}>
        <View style={[styles.progressFill, { width: `${progress(state) * 100}%`, backgroundColor: accent }]} />
      </View>
      <View style={styles.row}>
        <Eyebrow dark>{race.theme.displayName}</Eyebrow>
        {source.kind === 'simulation' ? <Body dark muted style={{ fontSize: 12 }} testID="sim-badge-live">{t('run.sim.badge')}</Body> : null}
      </View>
      <View style={{ paddingTop: space.md }}>
        <Body dark muted>{t('common.distance')}</Body>
        <Num dark size={96} testID="distance">{formatKm(state.distanceM, locale)}</Num>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Body dark muted>{t('run.elapsed')}</Body>
          <Num dark size={56} testID="elapsed">{formatClock(state.elapsedMs)}</Num>
        </View>
        <View style={{ flex: 1 }}>
          <Body dark muted>{t('common.pace')}</Body>
          <Num dark size={56} testID="pace">{formatPace(state.paceSecPerKm)}</Num>
        </View>
      </View>
      <View style={{ alignItems: 'center', paddingVertical: space.sm }}>
        <CourseDiagram track={track} officialM={course.distanceM} runM={state.distanceM} landmarks={course.landmarks} accent={accent} width={diagramW} height={diagramW * 0.62} />
      </View>
      <Card dark style={{ gap: 2 }}>
        <Body dark muted>{next ? `${t('run.next')} · km ${(next.meters / 1000).toFixed(1).replace('.0', '')}` : t('run.finish')}</Body>
        <Body dark style={{ fontFamily: fonts.bodyBold, fontSize: 18 }} testID="next-landmark">{next?.name ?? formatKm(course.distanceM, locale)}</Body>
        {run.nowPlaying ? <Body dark muted testID="now-playing">🔊 {run.nowPlaying.title ?? run.nowPlaying.id}</Body> : null}
      </Card>
      <View style={{ flex: 1 }} />
      <Button testID="stop" label={t('run.stopHold')} ghost dark onPress={() => undefined} onLongPress={() => void run.stop()} delayLongPress={1200} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  progressTrack: { height: 4, backgroundColor: colors.nightBorder, borderRadius: 2, overflow: 'hidden', marginBottom: space.md },
  progressFill: { height: 4 },
});
