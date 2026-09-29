import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type * as ImagePicker from 'expo-image-picker';
import { exifTakenAt } from '@sivoov/shared';

/**
 * The phone's own photo picker and camera (expo-image-picker), when this build has them. Like
 * the Mapbox SDK, a shell built before the module was added gets this JavaScript over the air
 * without the native half: there `picker` is null and the app opens the photos web page instead.
 * The system picker needs no access to the whole library (Android's Photo Picker, iOS PHPicker).
 */
const load = (): typeof ImagePicker | null => {
  if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExponentImagePicker')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-image-picker') as typeof ImagePicker;
  } catch {
    return null;
  }
};

export const picker = load();

/** A photo the runner chose or took, ready to send: where it is, and when it was taken if the photo says. */
export type PickedPhoto = { id: string; uri: string; name: string; type: string; takenAtMs: number | null; file?: File };

const offsetMinutes = (): number => -new Date().getTimezoneOffset();

const toPicked = (asset: ImagePicker.ImagePickerAsset, i: number, takenNow: boolean): PickedPhoto => ({
  id: asset.assetId ?? `${asset.uri}#${i}`,
  uri: asset.uri,
  name: asset.fileName ?? `photo-${i}.jpg`,
  type: asset.mimeType ?? 'image/jpeg',
  takenAtMs: takenNow ? Date.now() : exifTakenAt(asset.exif ?? null, offsetMinutes()),
  ...(asset.file ? { file: asset.file } : {}),
});

/**
 * Photos from the phone's gallery, several at once, with their EXIF so each can be matched to
 * the moment it was taken at. Null when the runner closed the picker.
 */
export const pickPhotos = async (limit: number): Promise<PickedPhoto[] | null> => {
  if (!picker) return null;
  const result = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: limit > 1, selectionLimit: limit, exif: true, quality: 0.8 });
  return result.canceled ? null : result.assets.map((a, i) => toPicked(a, i, false));
};

/** A selfie with the front camera, now (on the start line). Null when refused or closed. */
export const takeSelfie = async (): Promise<PickedPhoto | null> => {
  if (!picker) return null;
  const permission = await picker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;
  const result = await picker.launchCameraAsync({ mediaTypes: ['images'], cameraType: picker.CameraType.front, exif: true, quality: 0.8 });
  const asset = result.canceled ? null : result.assets[0];
  return asset ? toPicked(asset, 0, true) : null;
};
