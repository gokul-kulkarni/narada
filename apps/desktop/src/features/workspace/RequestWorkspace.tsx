import { Composer, DeliveryView } from "../../protocols/registry";
import { selectActiveTab, useTabsStore } from "../../state/tabs-store";
import { selectActiveEnvironment, useWorkspaceStore } from "../../state/workspace-store";
import { DeliveryLog } from "../delivery/DeliveryLog";
import { RecentDeliveries } from "../delivery/RecentDeliveries";
import { stopDelivery } from "../request/in-flight";

/** The open request of any protocol: its composer, then the log of its deliveries. */
export function RequestWorkspace() {
  const tab = useTabsStore(selectActiveTab);
  const environment = useWorkspaceStore((s) => selectActiveEnvironment(s)?.name ?? null);

  if (!tab) {
    return <RecentDeliveries />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-6 px-8 py-6">
        <Composer tab={tab} />
        <DeliveryLog
          tab={tab}
          environment={environment}
          onStop={() => stopDelivery(tab.id)}
          liveView={tab.partial && <DeliveryView tab={tab} delivery={tab.partial} live />}
          responseView={tab.delivery && <DeliveryView tab={tab} delivery={tab.delivery} />}
        />
      </div>
    </div>
  );
}
