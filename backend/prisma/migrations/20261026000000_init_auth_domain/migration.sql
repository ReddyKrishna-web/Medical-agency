-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'SALESMAN', 'AGENCY_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING', 'DISABLED');

-- CreateEnum
CREATE TYPE "AgencyStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateTable
CREATE TABLE "agencies" (
    "id" CHAR(24) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "legal_name" VARCHAR(160),
    "status" "AgencyStatus" NOT NULL DEFAULT 'ACTIVE',
    "logo_url" VARCHAR(500),
    "website" VARCHAR(200),
    "description" VARCHAR(2000),
    "contact" JSONB NOT NULL,
    "tax" JSONB NOT NULL,
    "order_settings" JSONB NOT NULL,
    "features" JSONB NOT NULL,
    "business_hours" JSONB NOT NULL DEFAULT '{}',
    "notifications" JSONB NOT NULL,
    "created_by" CHAR(24),
    "updated_by" CHAR(24),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" CHAR(24) NOT NULL,
    "agency_id" CHAR(24) NOT NULL,
    "auth_user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "phone" VARCHAR(32),
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "avatar_url" VARCHAR(500),
    "last_login_at" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_by" CHAR(24),
    "updated_by" CHAR(24),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agencies_slug_key" ON "agencies"("slug");

-- Row Level Security is deny-by-default for the PostgREST roles (anon /
-- authenticated). The API connects through Prisma as the database owner, which
-- bypasses RLS, so authorization stays in the Express middleware. This prevents
-- these tables from being readable through the automatically generated
-- Supabase data API.
ALTER TABLE "agencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;

-- CreateIndex
CREATE INDEX "agencies_name_idx" ON "agencies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_agency_id_role_status_idx" ON "users"("agency_id", "role", "status");

-- CreateIndex
CREATE INDEX "users_agency_id_name_idx" ON "users"("agency_id", "name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

