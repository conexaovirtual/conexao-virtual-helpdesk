import { Badge } from '@/components/ui/badge';
import { Cloud, Hand } from 'lucide-react';

interface AssetOriginBadgeProps {
  asset: { datto_device_uid?: string | null; datto_device_id?: string | null };
  size?: 'sm' | 'default';
}

export function isDattoManaged(asset: { datto_device_uid?: string | null; datto_device_id?: string | null }) {
  return !!(asset.datto_device_uid || asset.datto_device_id);
}

export function AssetOriginBadge({ asset, size = 'default' }: AssetOriginBadgeProps) {
  const managed = isDattoManaged(asset);

  if (managed) {
    return (
      <Badge className={`bg-info/15 text-info border-info/30 ${size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs'}`}>
        <Cloud className={`${size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} mr-1`} />
        NexoRMM
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={`${size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs'}`}>
      <Hand className={`${size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} mr-1`} />
      Manual
    </Badge>
  );
}
