/*
  Warnings:

  - A unique constraint covering the columns `[workspace_id,building_key]` on the table `rooms` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "building_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "rooms_workspace_id_building_key_key" ON "rooms"("workspace_id", "building_key");
