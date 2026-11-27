import { Screen } from '@/components/Screen';
import { ReportsScreen } from '@/components/screens/Reports';

export default function Page() {
  return (
    <Screen active="reports">
      <ReportsScreen />
    </Screen>
  );
}
