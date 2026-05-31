import { IsObject, IsString, MinLength } from 'class-validator';

export class CreateFormDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsObject()
  schema: object;
}
