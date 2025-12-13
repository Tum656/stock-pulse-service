import { MajorShareholdersMetaDto } from './MajorShareholdersMeta.dto';
import { MajorShareholderItemDto } from './MajorShareholderItem.dto';

export class MajorShareholdersResponseDto {
  symbol!: string;
  sourceUrl!: string;
  asOf!: string;
  meta!: MajorShareholdersMetaDto;
  items!: MajorShareholderItemDto[];
}
