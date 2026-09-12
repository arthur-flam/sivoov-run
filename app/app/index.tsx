import { Redirect } from 'expo-router';
import { useSession } from '@/stores/session';

export default function Index() {
  const status = useSession((s) => s.status);
  return <Redirect href={status === 'signedIn' ? '/home' : '/signin'} />;
}
