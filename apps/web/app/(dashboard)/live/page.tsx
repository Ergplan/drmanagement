import { Screen } from '@/components/Screen';
import { LiveScreen } from '@/components/screens/Live';

export default function Page() {
  return (
    <Screen active="live">
      <LiveScreen />
    </Screen>
  );
}
