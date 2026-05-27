"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTokens, formatRequests } from "@/lib/format";
import type { ModelWithUsage } from "@/lib/queries";

export function ModelTable({ models }: { models: ModelWithUsage[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Rank</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead className="text-right">7d Tokens</TableHead>
          <TableHead className="text-right">7d Requests</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {models.map((model, i) => (
          <TableRow key={model.id} className="cursor-pointer hover:bg-[#F0F4F8]">
            <TableCell className="font-medium text-[#6B7785]">
              {i + 1}
            </TableCell>
            <TableCell>
              <Link
                href={`/model/${encodeURIComponent(model.permaslug)}`}
                className="flex items-center gap-2 font-medium hover:underline"
              >
                <span
                  className="inline-block h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: model.color_hex }}
                />
                {model.display_name}
              </Link>
            </TableCell>
            <TableCell className="text-[#6B7785]">
              {model.brand}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatTokens(model.tokens_7d)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatRequests(model.requests_7d)}
            </TableCell>
          </TableRow>
        ))}
        {models.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-[#6B7785] py-8">
              No data yet. Trigger a fetch first.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
