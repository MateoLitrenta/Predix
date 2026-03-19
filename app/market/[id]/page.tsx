import MarketDetailClient from "./MarketDetailClient";

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  return <MarketDetailClient marketId={id} />;
}
