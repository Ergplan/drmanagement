import { Screen } from '@/components/Screen';
import { TariffScreen } from '@/components/screens/Tariff';

export default function Page() {
  return (
    <Screen active="tariff">
      <TariffScreen />
    </Screen>
  );
}
