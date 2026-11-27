import { Screen } from '@/components/Screen';
import { OptimizerScreen } from '@/components/screens/Optimizer';

export default function Page() {
  return (
    <Screen active="optimizer">
      <OptimizerScreen />
    </Screen>
  );
}
