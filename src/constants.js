export const SPLIT_RATIOS = {
  TRAIN: 80,
  VALIDATION: 10,
  TEST: 10
};

export const SUPPORTED_MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  mp4: 'video/mp4',
  json: 'application/json',
  jsonl: 'application/x-jsonlines',
  csv: 'text/csv',
  txt: 'text/plain'
};

export const HEADERS = {
  SIGNATURE: 'X-Vera-Signature',
  PROJECT_ID: 'X-Project-ID',
  DATA_TYPE: 'X-Data-Type'
};

export const DATA_TYPES = {
  MEDIA: 'media',
  TEXT: 'text',
  RLHF: 'rlhf'
};