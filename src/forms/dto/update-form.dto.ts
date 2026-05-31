import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateFormDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsObject()
  schema?: object;
}
