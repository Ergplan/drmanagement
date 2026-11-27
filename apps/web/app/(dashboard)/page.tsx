import { Screen } from '@/components/Screen';
import { OverviewScreen } from '@/components/screens/Overview';

export default function Overview() {
  return (
    <Screen active="overview">
      <OverviewScreen />
    </Screen>
  );
}
