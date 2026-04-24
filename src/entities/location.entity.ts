import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity()
export class Location {
  @PrimaryColumn()
  id!: number;

  @Column({ unique: true })
  externalLocationId!: string;

  @Column()
  name!: string;
}
