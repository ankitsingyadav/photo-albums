export interface User { id: number; email: string }

export interface Photo {
  id: number;
  filename: string;
  width: number | null;
  height: number | null;
  size: number;
  takenAt: string | null;
  uploadedAt: string;
  sortDate: string;
  dateSource: "exif" | "upload";
  favorite?: boolean; // not sent on public links
  tags: string[];
  thumbUrl: string; // small image used in galleries
  fileUrl: string;  // full-size image, only loaded in the viewer
}

export interface Album {
  id: number;
  title: string;
  photoCount: number;
  coverPhotoId: number | null;
  coverUrl: string | null;
  hasCustomCover: boolean;
  shareEnabled: boolean;
  shareToken: string | null;
  createdAt: string;
}

export type Sort = "date_desc" | "date_asc";
export interface TagCount { name: string; count: number }
export interface UploadResult { photos: Photo[]; errors: { filename: string; message: string }[] }

export interface Stats { photos: number; bytes: number; favorites: number; albums: number; sharedAlbums: number }
