import { Screen } from '@/components/Screen';
import { FlexibilityScreen } from '@/components/screens/Flexibility';

export default function Page() {
  return (
    <Screen active="flexibility">
      <FlexibilityScreen />
    </Screen>
  );
}
