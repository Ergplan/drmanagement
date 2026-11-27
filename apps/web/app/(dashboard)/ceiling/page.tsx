import { Screen } from '@/components/Screen';
import { CeilingScreen } from '@/components/screens/Ceiling';

export default function Page() {
  return (
    <Screen active="ceiling">
      <CeilingScreen />
    </Screen>
  );
}
