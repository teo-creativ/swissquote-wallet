"use client";

import { useCallback, useState } from "react";
import { Banner, Card, EmptyState, Spinner } from "@/components/ui";
import { getRequests } from "@/lib/lawyerApi";
import { STATUS_FILTERS } from "@/lib/labels";
import type { RequestStatus } from "@/lib/lawyerApi.types";
import { RequestsTable } from "./RequestsTable";
import { UpdatedAgo } from "./UpdatedAgo";
import { usePolling } from "./usePolling";

/** L5: filter chips (pending, approved, refused, expired) and a list that refreshes every 5 s. */
export function RequestsView() {
  const [status, setStatus] = useState<RequestStatus>("pending");
  const load = useCallback(() => getRequests(status), [status]);
  const { data, error, updatedAt } = usePolling(load);
  const filter = STATUS_FILTERS.find((f) => f.status === status)!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[28px] font-semibold leading-9 text-ink">Requests</h1>
        <UpdatedAgo at={updatedAt} />
      </div>

      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = f.status === status;
          return (
            <button
              key={f.status}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(f.status)}
              className={`inline-flex h-11 items-center rounded-pill px-5 text-sm font-medium transition-colors duration-200 ease-out ${
                active ? "bg-ink text-white" : "bg-white text-ink"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error && !data && <Banner variant="warning">{error}</Banner>}
      <Card flush>
        {!data && !error ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading requests" />
          </div>
        ) : data && data.length === 0 ? (
          <EmptyState title={filter.empty} />
        ) : data ? (
          <RequestsTable rows={data} caption={`${filter.label} requests`} now={Date.now()} />
        ) : null}
      </Card>
    </div>
  );
}
