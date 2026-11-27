import { Screen } from '@/components/Screen';
import { CommissioningScreen } from '@/components/screens/Commissioning';

export default function Page() {
  return (
    <Screen active="safety" title="Commissioning and point mapping">
      <CommissioningScreen />
    </Screen>
  );
}
