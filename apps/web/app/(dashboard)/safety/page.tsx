import { Screen } from '@/components/Screen';
import { SafetyScreen } from '@/components/screens/Safety';

export default function Page() {
  return (
    <Screen active="safety">
      <SafetyScreen />
    </Screen>
  );
}
