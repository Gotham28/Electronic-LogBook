import * as React from "react";
import { ClipboardCheck, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatLogbookDate } from "@/lib/logbook-config";
import { apiGet } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";
import { toast } from "sonner";

type Assessment = {
  number: number;
  examName: string;
  type: string;
  date: string;
  marks: number;
  maximum: number;
  assessorId: number;
  assessorName: string;
};

export function AssessmentsPage() {
  const [assessments, setAssessments] = React.useState<Assessment[]>([]);
  const user = React.useMemo(() => getCurrentUser(), []);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchAssessments = React.useCallback(async () => {
    if (!user?.studentProfileId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(`/api/students/${user.studentProfileId}/assessments`);
      setAssessments(data || []);
    } catch (e: any) {
      toast.error("Failed to fetch assessments");
      // AGENTS.md sec 7 (SEC-17): assessments stays [] on failure, which otherwise
      // renders identically to "you genuinely have none yet" below.
      setError(e?.message || "Could not load your assessments");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  React.useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="page-eyebrow flex items-center gap-2">Training progress</p>
          <h2 className="page-title mt-1">Assessments</h2>
          <p className="mt-2 text-sm text-slate-500">Your quarterly and annual assessment results, entered by your faculty assessor.</p>
        </div>
      </div>

      <Card className="border-white/70 bg-white/76">
        <CardHeader className="border-b border-white/70">
          <CardTitle className="text-lg">Assessment Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
             <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
              <p className="text-sm font-medium text-rose-700">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchAssessments} className="border-rose-200 text-rose-700">Try again</Button>
            </div>
          ) : assessments.length === 0 ? (
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ClipboardCheck className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>No assessments recorded</EmptyTitle>
                <EmptyDescription>Assessment scores will appear here once your faculty member enters them.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Exam Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Assessed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map((item) => (
                  <TableRow key={item.number}>
                    <TableCell className="font-medium text-slate-900">{formatLogbookDate(item.date)}</TableCell>
                    <TableCell>{item.examName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{item.type}</Badge>
                    </TableCell>
                    <TableCell className="font-bold text-slate-900">{item.marks} / {item.maximum}</TableCell>
                    <TableCell>{item.assessorName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
