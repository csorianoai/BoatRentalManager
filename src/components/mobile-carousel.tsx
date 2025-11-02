import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Pagination, Autoplay } from 'swiper/modules'
import type { ReactNode } from 'react'

interface MobileCarouselProps {
  items: ReactNode[]
  slidesPerView?: number
  spaceBetween?: number
  autoplay?: boolean
  pagination?: boolean
  navigation?: boolean
  className?: string
}

export function MobileCarousel({
  items,
  slidesPerView = 1.2,
  spaceBetween = 16,
  autoplay = false,
  pagination = true,
  navigation = false,
  className = '',
}: MobileCarouselProps) {
  const modules = []
  if (pagination) modules.push(Pagination)
  if (navigation) modules.push(Navigation)
  if (autoplay) modules.push(Autoplay)

  return (
    <div className={`md:hidden ${className}`}>
      <Swiper
        modules={modules}
        spaceBetween={spaceBetween}
        slidesPerView={slidesPerView}
        pagination={pagination ? { clickable: true } : false}
        navigation={navigation}
        autoplay={autoplay ? { delay: 3000, disableOnInteraction: true } : false}
        className="pb-12"
      >
        {items.map((item, index) => (
          <SwiperSlide key={index}>{item}</SwiperSlide>
        ))}
      </Swiper>
    </div>
  )
}
