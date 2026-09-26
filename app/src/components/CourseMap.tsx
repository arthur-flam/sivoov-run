import { useState } from 'react';
import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { API_URL } from '@/api';
import { Body } from '@/components/ui';
import { colors, radius } from '@/theme';

type Props = { courseId: string; caption?: string; fallback?: ReactNode };

/**
 * The course on a real map: a PNG rendered by the Worker from Mapbox Static Images
 * (JS-only, no native map module). When the image cannot be had (no token, offline) the
 * fallback takes its place, so the home screen never loses the course.
 */
export const CourseMap = ({ courseId, caption, fallback = null }: Props) => {
  const [failed, setFailed] = useState(false);
  const captionLine = caption ? (
    <Body muted style={styles.caption}>
      {caption}
    </Body>
  ) : null;
  if (failed) {
    return fallback ? (
      <View style={styles.wrap} testID="course-map">
        {fallback}
        {captionLine}
      </View>
    ) : null;
  }
  return (
    <View style={styles.wrap} testID="course-map">
      <Image source={{ uri: `${API_URL}/api/courses/${courseId}/map.png?w=720&h=400` }} style={styles.image} resizeMode="cover" accessibilityLabel={caption} onError={() => setFailed(true)} />
      {captionLine}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  image: { width: '100%', aspectRatio: 720 / 400, borderRadius: radius.md, backgroundColor: colors.card },
  caption: { fontSize: 13 },
});
