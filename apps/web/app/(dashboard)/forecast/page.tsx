import { Screen } from '@/components/Screen';
import { ForecastScreen } from '@/components/screens/Forecast';

export default function Page() {
  return (
    <Screen active="forecast">
      <ForecastScreen />
    </Screen>
  );
}
