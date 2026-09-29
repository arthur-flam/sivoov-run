import { useEffect, useState } from 'react';
import { Image, Platform } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import { API_URL } from '@/api';

type Props = { path: string; token: string; style: StyleProp<ImageStyle>; label: string; testID?: string };

/**
 * A private picture from the API (a runner's race photo), read with their token. A phone's
 * Image sends the header itself; the web target's cannot, so it fetches the file first.
 */
export const AuthedImage = ({ path, token, style, label, testID }: Props) => {
  const url = `${API_URL}${path}`;
  const [webUri, setWebUri] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const aborted = { now: false };
    const made = { uri: null as string | null };
    void fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || aborted.now) return;
        made.uri = URL.createObjectURL(blob);
        setWebUri(made.uri);
      })
      .catch(() => undefined);
    return () => {
      aborted.now = true;
      if (made.uri) URL.revokeObjectURL(made.uri);
    };
  }, [url, token]);
  if (Platform.OS === 'web') return webUri ? <Image testID={testID} source={{ uri: webUri }} style={style} accessibilityLabel={label} /> : null;
  return <Image testID={testID} source={{ uri: url, headers: { Authorization: `Bearer ${token}` } }} style={style} accessibilityLabel={label} resizeMode="cover" />;
};
