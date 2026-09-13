import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { API_URL } from '@/api';
import { Body } from '@/components/ui';
import { colors, radius } from '@/theme';

type Props = { courseId: string; caption?: string };

/**
 * The course on a real map: a PNG rendered by the Worker from Mapbox Static Images
 * (JS-only, no native map module). Hidden when the image is unavailable (no token, offline).
 */
export const CourseMap = ({ courseId, caption }: Props) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <View style={styles.wrap} testID="course-map">
      <Image source={{ uri: `${API_URL}/api/courses/${courseId}/map.png?w=720&h=400` }} style={styles.image} resizeMode="cover" accessibilityLabel={caption} onError={() => setFailed(true)} />
      {caption ? (
        <Body muted style={styles.caption}>
          {caption}
        </Body>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  image: { width: '100%', aspectRatio: 720 / 400, borderRadius: radius.md, backgroundColor: colors.card },
  caption: { fontSize: 13 },
});
