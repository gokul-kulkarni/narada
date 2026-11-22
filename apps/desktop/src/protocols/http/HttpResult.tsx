import type { HttpDelivery } from "../../lib/model";
import type { RequestTab } from "../../state/tabs-store";
import { ResponseViewer } from "../../features/response/ResponseViewer";
import { TestResults, testSummary } from "../../features/scripts/TestResults";

interface Props {
  readonly tab: RequestTab;
  readonly delivery: HttpDelivery;
  readonly live?: boolean;
}

/** Body, headers and, once finished, the test results of an HTTP delivery. */
export function HttpResult({ tab, delivery, live = false }: Props) {
  if (live) return <ResponseViewer key={tab.id} response={delivery.response} live />;
  const ranScripts = tab.tests.length > 0 || tab.logs.length > 0;
  return (
    <ResponseViewer
      key={tab.id}
      response={delivery.response}
      testResults={ranScripts ? <TestResults tests={tab.tests} logs={tab.logs} /> : undefined}
      testSummary={testSummary(tab.tests)}
    />
  );
}
