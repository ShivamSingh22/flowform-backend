import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';

@Injectable()
export class FormsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateFormDto) {
    return this.prisma.form.create({
      data: { title: dto.title, schema: dto.schema, userId },
    });
  }

  findAll(userId: string) {
    return this.prisma.form.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const form = await this.prisma.form.findFirst({ where: { id, userId } });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  async update(userId: string, id: string, dto: UpdateFormDto) {
    await this.findOne(userId, id);
    return this.prisma.form.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.form.delete({ where: { id } });
  }

  async togglePublish(userId: string, id: string) {
    const form = await this.findOne(userId, id);
    return this.prisma.form.update({
      where: { id },
      data: { isPublished: !form.isPublished },
    });
  }
}
