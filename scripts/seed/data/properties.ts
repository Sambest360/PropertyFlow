export const IMG = {
    house: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80',
    house2: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80',
    apt: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80',
    apt2: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80',
    town: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80',
    view: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&q=80',
    kitchen: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  }
  
  export type PropertyTemplate = {
    feId: string
    agentFeId: string
    buildingName: string
    address: string
    suburb: string
    lat: number
    lng: number
    title: string
    description: string
    bedrooms: number
    bathrooms: number
    parking: number
    sqm: number
    listingType: 'RENT' | 'SALE' | 'BOTH'
    rent: number | null
    price: number | null
    status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED'
    featured: boolean
    images: string[]
    amenities: string[]
    withRooms: boolean
  }
  
  const SUBURBS = [
    { suburb: 'Tamboerskloof', lat: -33.9365, lng: 18.4012 },
    { suburb: 'Gardens', lat: -33.9318, lng: 18.4134 },
    { suburb: 'Oranjezicht', lat: -33.9289, lng: 18.4098 },
    { suburb: 'Vredehoek', lat: -33.9342, lng: 18.4256 },
    { suburb: 'De Waterkant', lat: -33.9187, lng: 18.4195 },
    { suburb: 'City Bowl', lat: -33.9249, lng: 18.4241 },
  ]
  
  function pickSuburb(i: number) {
    return SUBURBS[i % SUBURBS.length]
  }
  
  function buildProperties(): PropertyTemplate[] {
    const agentFeIds = [
      'u-agent-james',
      'u-agent-priya',
      'u-agent-themba',
      'u-agent-nadia',
      'u-agent-chris',
    ]
    const counts = [1, 2, 4, 6, 3]
    const props: PropertyTemplate[] = []
    let n = 0
  
    for (let a = 0; a < agentFeIds.length; a++) {
      for (let c = 0; c < counts[a]; c++) {
        n += 1
        const feId = `PR-SCB-${String(n).padStart(3, '0')}`
        const loc = pickSuburb(n)
        const isRent = n % 3 !== 0
        const isSale = n % 4 === 0
        const listingType: PropertyTemplate['listingType'] =
          isRent && isSale ? 'BOTH' : isSale ? 'SALE' : 'RENT'
        const status: PropertyTemplate['status'] =
          n <= 5 ? 'OCCUPIED' : n <= 7 ? 'RESERVED' : 'AVAILABLE'
        const beds = 1 + (n % 4)
        const imgSet = [IMG.house, IMG.apt, IMG.town, IMG.view, IMG.kitchen]
        const image = imgSet[n % imgSet.length]
  
        props.push({
          feId,
          agentFeId: agentFeIds[a],
          buildingName: `${loc.suburb} ${isRent ? 'Residence' : 'Estate'} ${n}`,
          address: `${10 + n} Kloof Street`,
          suburb: loc.suburb,
          lat: loc.lat + (n % 5) * 0.001,
          lng: loc.lng + (n % 3) * 0.001,
          title: `${beds}-bed ${loc.suburb} ${isRent ? 'apartment' : 'home'}`,
          description: `Character ${loc.suburb} property with mountain views, close to Kloof Street cafés and the City Bowl.`,
          bedrooms: beds,
          bathrooms: beds >= 3 ? 2 : 1,
          parking: n % 2 === 0 ? 1 : 0,
          sqm: 55 + beds * 28 + (n % 7) * 5,
          listingType,
          rent: isRent || listingType === 'BOTH' ? 12000 + n * 850 : null,
          price: isSale || listingType === 'BOTH' ? 1850000 + n * 125000 : null,
          status,
          featured: n <= 4,
          images: [image, imgSet[(n + 1) % imgSet.length]],
          amenities: ['fibre', 'security', ...(n % 2 === 0 ? ['pool'] : []), ...(n % 3 === 0 ? ['solar'] : [])],
          withRooms: n <= 8,
        })
      }
    }
  
    return props
  }
  
  export const PROPERTIES = buildProperties()
  