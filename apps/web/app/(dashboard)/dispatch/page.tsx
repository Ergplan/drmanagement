import { Suspense } from 'react';
import { Screen } from '@/components/Screen';
import { DispatchScreen } from '@/components/screens/Dispatch';

export default function Page() {
  return (
    <Screen active="dispatch">
      <Suspense>
        <DispatchScreen />
      </Suspense>
    </Screen>
  );
}
