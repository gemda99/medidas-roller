export type Role = 'admin' | 'medidor';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  active: boolean;
}
