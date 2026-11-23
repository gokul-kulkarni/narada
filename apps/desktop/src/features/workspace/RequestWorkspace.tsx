import { SplitPane } from "../../components/SplitPane";
import { Composer, DeliveryView } from "../../protocols/registry";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
import { selectActiveEnvironment, useWorkspaceStore } from "../../state/workspace-store";
import { DeliveryLog } from "../delivery/DeliveryLog";
import { RecentDeliveries } from "../delivery/RecentDeliveries";
import { stopDelivery } from "../request/in-flight";

/** The open request of any protocol: its composer above, its latest delivery below. */
export function RequestWorkspace() {
  const tab = useTabsStore(selectActiveTab);
  const environment = useWorkspaceStore((s) => selectActiveEnvironment(s)?.name ?? null);

  if (!tab) {
    return <RecentDeliveries />;
  }

  return (
    <SplitPane
      top={<Composer tab={tab} />}
      bottom={
        <DeliveryLog
          tab={tab}
          environment={environment}
          onStop={() => stopDelivery(tab.id)}
          liveView={tab.partial && <DeliveryView tab={tab} delivery={tab.partial} live />}
          responseView={tab.delivery && <DeliveryView tab={tab} delivery={tab.delivery} />}
        />
      }
    />
  );
}
