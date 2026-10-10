import type { TemplateBlock, TemplateDefinition } from '@/lib/templates';

const es: TemplateBlock[] = [
  {
    type: 'navbar',
    data: {
      brandName: 'La Brasa',
      logoImage: '',
      links: [
        { label: 'El Menú', url: '#gallery' },
        { label: 'Nuestra Historia', url: '#features' },
        { label: 'Ubicación', url: '#cta' },
      ],
      ctaText: 'Reservar Mesa',
      ctaLink: '#cta',
    },
  },
  {
    type: 'hero',
    data: {
      title: 'Sabor auténtico en cada bocado.',
      subtitle: 'Carnes a la brasa y cocina de autor en el corazón de la ciudad. Una experiencia gastronómica inolvidable.',
      buttonText: 'Ver el menú',
      backgroundImage: '',
    },
  },
  {
    type: 'features',
    data: {
      title: 'Nuestra esencia',
      features: [
        {
          title: 'Ingredientes de proximidad',
          description: 'Trabajamos exclusivamente con productores locales para garantizar la máxima frescura y calidad en cada plato.',
        },
        {
          title: 'Horno de leña tradicional',
          description: 'Nuestras carnes y verduras se preparan lentamente en nuestro horno de leña, dándoles ese sabor ahumado inconfundible.',
        },
      ],
    },
  },
  {
    type: 'gallery',
    data: {
      title: 'Nuestros platos estrella',
      subtitle: 'Un vistazo a lo que te espera en La Brasa.',
      columns: '3',
      images: [
        { src: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', alt: '' },
      ],
    },
  },
  {
    type: 'testimonials',
    data: {
      title: 'Reseñas de nuestros comensales',
      testimonials: [
        {
          quote: 'El mejor chuletón que he probado en mi vida. El ambiente es acogedor y el servicio impecable. Repetiremos seguro.',
          author: 'Javier M.',
          role: 'Guía Local de Google',
        },
        {
          quote: 'Increíble experiencia. Los entrantes son muy originales y los postres caseros son el broche de oro perfecto.',
          author: 'Sofía R.',
          role: 'Cliente habitual',
        },
      ],
    },
  },
  {
    type: 'cta',
    data: {
      title: 'Ven a visitarnos',
      subtitle: 'Calle Mayor 45, Centro Histórico. Abierto de Martes a Domingo.',
      buttonText: 'Haz tu reserva',
    },
  },
  {
    type: 'footer',
    data: {
      brandName: 'La Brasa',
      description: 'Cocina de brasa contemporánea. Donde el fuego y el sabor se encuentran.',
      links: [
        { label: 'Instagram', url: '' },
        { label: 'TripAdvisor', url: '' },
        { label: 'Aviso Legal', url: '' },
      ],
      copyright: '© 2026 La Brasa. Todos los derechos reservados.',
    },
  },
];

const en: TemplateBlock[] = [
  {
    type: 'navbar',
    data: {
      brandName: 'La Brasa',
      logoImage: '',
      links: [
        { label: 'The Menu', url: '#gallery' },
        { label: 'Our Story', url: '#features' },
        { label: 'Location', url: '#cta' },
      ],
      ctaText: 'Book a Table',
      ctaLink: '#cta',
    },
  },
  {
    type: 'hero',
    data: {
      title: 'Authentic flavor in every bite.',
      subtitle: 'Grilled meats and signature cooking in the heart of the city. A dining experience you will not forget.',
      buttonText: 'See the menu',
      backgroundImage: '',
    },
  },
  {
    type: 'features',
    data: {
      title: 'Our essence',
      features: [
        {
          title: 'Locally sourced ingredients',
          description: 'We work exclusively with local producers to guarantee the best freshness and quality in every dish.',
        },
        {
          title: 'Traditional wood-fired oven',
          description: 'Our meats and vegetables are slowly cooked in our wood-fired oven, giving them that unmistakable smoky flavor.',
        },
      ],
    },
  },
  {
    type: 'gallery',
    data: {
      title: 'Our signature dishes',
      subtitle: 'A glimpse of what awaits you at La Brasa.',
      columns: '3',
      images: [
        { src: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80', alt: '' },
        { src: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', alt: '' },
      ],
    },
  },
  {
    type: 'testimonials',
    data: {
      title: 'What our guests say',
      testimonials: [
        {
          quote: 'The best steak I have ever had. The atmosphere is cozy and the service is impeccable. We will definitely be back.',
          author: 'James M.',
          role: 'Google Local Guide',
        },
        {
          quote: 'Incredible experience. The starters are very original and the homemade desserts are the perfect finishing touch.',
          author: 'Sophie R.',
          role: 'Regular customer',
        },
      ],
    },
  },
  {
    type: 'cta',
    data: {
      title: 'Come and visit us',
      subtitle: '45 Main Street, Old Town. Open Tuesday to Sunday.',
      buttonText: 'Make your reservation',
    },
  },
  {
    type: 'footer',
    data: {
      brandName: 'La Brasa',
      description: 'Contemporary grill cooking. Where fire and flavor meet.',
      links: [
        { label: 'Instagram', url: '' },
        { label: 'TripAdvisor', url: '' },
        { label: 'Legal Notice', url: '' },
      ],
      copyright: '© 2026 La Brasa. All rights reserved.',
    },
  },
];

export const restaurant: TemplateDefinition = {
  id: 'restaurant',
  presetId: 'ember',
  content: {
    es: {
      name: 'Restaurante',
      description: 'Landing para restaurante de brasa con galería de platos, testimonios, ubicación y reservas.',
      category: 'Gastronomía',
      blocks: es,
    },
    en: {
      name: 'Restaurant',
      description: 'Landing page for a grill restaurant, with a gallery of dishes, reviews, location and bookings.',
      category: 'Food & drink',
      blocks: en,
    },
  },
};
