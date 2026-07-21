export type JobType = 'merge_pdf' | 'split_pdf' | 'compress_pdf';

export interface Job {
  jobId: string;
  type: JobType;
  status: 'pending' | 'processing' | 'done' | 'failed';
  files: { fileId: string; storageKey: string; order: number }[];
  resultKey: string | null;
  createdAt: string;
  expiresAt: string;
}
