export default {
    maxPositions: 3,
    riskPercent: 0.03,
    maxLeverage: 25,

    
    minVolume24h: 5000000,             
    changePctMin: 0.1,                
    topN: 10,
    candlesCount: 72,
    candlesInterval: '4h',
    openaiModel: 'gpt-4o',
    minNotionalUSDT: 15,
    maxFundingRate: 0.005,
    atrPeriod: 10,
    preFilterLimit: 300,               
    rateBatchSize: 20,
    rateBatchPauseMs: 200,
    rsiPeriod: 14,
    emaPeriod: 13,
    feePct: 0.0004,
    rsiOverbought: 85,
    rsiOversold: 15,
    tpRangeMin: 2.0,
    tpRangeMax: 6.0,
    maxSpreadPct: 0.2,                
    minOpenInterest: 30000,            

    allowLooseCandidates: true,
    minTapeSpeedDay: 300,             
    minTapeSpeedNight: 100,           
    minDeltaVolumeDay: 50000,          
    minDeltaVolumeNight: 25000,
    fallbackOI: 0.7,                  
    fallbackDeltaVolumeMultiplier: 0.5,

    useAdaptiveThresholds: true,
    daySessionUTC: [8, 20], 

    volatilityThresholds: {
        calm: 0.5,
        stable: 1.2,
        high: 2.5,
        explosive: 4.0
    },

    confidenceThresholds: {
        strong: 80,
        medium: 60,
        weak: 40
    },

    strictValidation: false,           
    minTrendStrength: 0.03,           
    minOIChangePct: 2.0               
};
