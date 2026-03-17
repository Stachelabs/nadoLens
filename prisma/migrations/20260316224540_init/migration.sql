-- CreateTable
CREATE TABLE "Liquidation" (
    "id" SERIAL NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "amount" DECIMAL(30,18) NOT NULL,
    "price" DECIMAL(30,18) NOT NULL,
    "liquidator" TEXT NOT NULL,
    "liquidatee" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Liquidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OiSnapshot" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "price_low" DECIMAL(20,2) NOT NULL,
    "price_high" DECIMAL(20,2) NOT NULL,
    "long_oi_usd" DECIMAL(20,2) NOT NULL,
    "short_oi_usd" DECIMAL(20,2) NOT NULL,
    "snapshot_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Liquidation_product_id_timestamp_idx" ON "Liquidation"("product_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "OiSnapshot_product_id_price_low_idx" ON "OiSnapshot"("product_id", "price_low");
