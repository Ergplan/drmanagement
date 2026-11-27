import { Screen } from '@/components/Screen';
import { StreetView } from '@/street/StreetView';

export default function StreetPage() {
  return (
    <Screen active="street">
      <StreetView />
    </Screen>
  );
}
