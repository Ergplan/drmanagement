import { Screen } from '@/components/Screen';
import { SolarScreen } from '@/components/screens/Solar';

export default function Page() {
  return (
    <Screen active="solar">
      <SolarScreen />
    </Screen>
  );
}
