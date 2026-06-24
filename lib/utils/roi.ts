export function calculateUserROI(totalPortfolio: number, baseCapital: number) {
  const variationPts = totalPortfolio - baseCapital;
  
  let divisor = baseCapital;
  if (divisor === 0) divisor = 10000;
  
  // Use Math.abs(divisor) so that if baseCapital is somehow negative, 
  // the percentage direction correctly reflects the variation.
  const percentage = (variationPts / Math.abs(divisor)) * 100;
  
  return {
    value: variationPts,
    percentage: percentage
  };
}
