export interface ApisRelease {
  version: string;
  title: string;
  description: string;
  tag: string;
  build: number;
  is_latest: boolean;
  download_url: string;
  file_name: string;
  file_size: number;
  published_at: string;
}

export interface ApisInfoResponse {
  repo?: string;
  updated_at?: string;
  releases?: ApisRelease[];
}
