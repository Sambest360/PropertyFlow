import { useEffect, useRef } from 'react'
import { Input, cn } from './ui'
import { hasGoogleMapsKey } from '../lib/api/mapsLoader'
import { useGoogleMaps } from '../context/GoogleMapsProvider'

export type PlacesAddressValue = {
  address: string
  suburb?: string
  city?: string
  lat?: number
  lng?: number
  placeId?: string
  formattedAddress?: string
}

type Props = {
  value: string
  onChange: (next: string) => void
  onPlaceSelect?: (place: PlacesAddressValue) => void
  placeholder?: string
  className?: string
  id?: string
  disabled?: boolean
  'aria-label'?: string
}

function PlainAddressInput({
  value,
  onChange,
  placeholder = 'Street address',
  className,
  id,
  disabled,
  'aria-label': ariaLabel,
}: Props) {
  return (
    <Input
      id={id}
      className={cn(className)}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      autoComplete="street-address"
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function GooglePlacesAddressInput(props: Props) {
  const {
    value,
    onChange,
    onPlaceSelect,
    placeholder = 'Street address',
    className,
    id,
    disabled,
    'aria-label': ariaLabel,
  } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const { isLoaded, loadError } = useGoogleMaps()

  useEffect(() => {
    if (!hasGoogleMapsKey() || !isLoaded || loadError || !inputRef.current || !onPlaceSelect) return
    const g = window.google
    if (!g?.maps?.places?.Autocomplete) return

    const autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
      fields: ['place_id', 'formatted_address', 'geometry', 'address_components', 'name'],
      componentRestrictions: { country: 'za' },
      types: ['address'],
    })

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      const components = place.address_components ?? []
      const get = (type: string) =>
        components.find((c) => c.types.includes(type))?.long_name ?? ''

      const suburb = get('sublocality_level_1') || get('sublocality') || get('neighborhood')
      const city = get('locality') || get('administrative_area_level_2')
      const route = get('route')
      const streetNumber = get('street_number')
      const address =
        [streetNumber, route].filter(Boolean).join(' ') ||
        place.name ||
        place.formatted_address ||
        value

      const loc = place.geometry?.location
      onPlaceSelect({
        address,
        suburb: suburb || undefined,
        city: city || undefined,
        lat: loc ? loc.lat() : undefined,
        lng: loc ? loc.lng() : undefined,
        placeId: place.place_id,
        formattedAddress: place.formatted_address,
      })
      onChange(address)
    })

    return () => {
      g.maps.event.removeListener(listener)
    }
  }, [isLoaded, loadError, onPlaceSelect, onChange, value])

  if (loadError) {
    return <PlainAddressInput {...props} />
  }

  return (
    <Input
      ref={inputRef}
      id={id}
      className={cn(className)}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      autoComplete="street-address"
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/**
 * Address input with Google Places Autocomplete when a Maps key is present.
 * Without a key (or if Places fails), behaves as a plain text Input.
 */
export function PlacesAddressInput(props: Props) {
  if (!hasGoogleMapsKey()) {
    return <PlainAddressInput {...props} />
  }
  return <GooglePlacesAddressInput {...props} />
}
