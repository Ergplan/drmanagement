import { Screen } from '@/components/Screen';
import { ThermalScreen } from '@/components/screens/Thermal';

export default function Page() {
  return (
    <Screen active="thermal">
      <ThermalScreen />
    </Screen>
  );
}
