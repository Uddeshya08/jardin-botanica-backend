import { randomUUID } from "node:crypto";
import type { ExecArgs } from "@medusajs/framework/types";
import { getMetaConfig, getMetaDataset, hashMetaValue, sendMetaEvent } from "../services/meta-capi";

export default async function validateMetaCapi({ args }: ExecArgs): Promise<void> {
  const options = args.map((arg) => arg.replace(/^--/, ""));
  const config = getMetaConfig();
  console.log(`Configured Meta dataset: ${config.datasetId}`);
  try {
    const dataset = await getMetaDataset(config);
    console.log(`Meta confirmed dataset: ${dataset.name} (${dataset.id})`);
  } catch {
    console.warn("Dataset name could not be read. Some event tokens lack asset-read permission; Test Events is the final check.");
  }
  if (!options.includes("send-test")) {
    console.log("No event sent. To validate ingestion, supply send-test and expected-dataset-id=<ID copied from Events Manager>.");
    return;
  }
  const expected = options.find((arg) => arg.startsWith("expected-dataset-id="))?.split("=")[1];
  if (!expected || expected !== config.datasetId) {
    throw new Error("Expected dataset ID is missing or differs from META_PIXEL_ID. No event sent.");
  }
  if (!config.testEventCode) throw new Error("Set META_TEST_EVENT_CODE before sending a validation event");
  const eventId = `capi_connection_test_${randomUUID()}`;
  const receipt = await sendMetaEvent(config, {
    event_name: "CapiConnectionTest", event_id: eventId, event_time: Math.floor(Date.now() / 1000),
    action_source: "website", event_source_url: new URL("/in", config.storefrontUrl).href,
    // Synthetic, random identifier: no real customer data or false Purchase event.
    user_data: { external_id: [hashMetaValue(eventId)] },
  });
  console.log(JSON.stringify({ dataset_id: config.datasetId, event_id: eventId, ...receipt }, null, 2));
  console.log("Open this exact dataset's Test events tab and verify CapiConnectionTest arrived from Server with the same event ID.");
}
