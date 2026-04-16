import { Router } from 'express';
import { PRODUCTS } from '../data/products.js';

export const catalogRouter = Router();

catalogRouter.get('/catalog', (_req, res) => {
  res.setHeader('X-UCP-Extension', 'demo-catalog');
  res.json({
    note: 'Non-UCP-standard endpoint. Real UCP obtains products via merchant JSON-LD or GMC feed.',
    products: PRODUCTS.map((p) => ({
      '@context': 'https://schema.org',
      '@type': 'Product',
      '@id': p.id,
      name: p.title,
      image: p.image_url,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'TWD',
        price: p.price,
        availability: p.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.review_count },
    })),
  });
});
