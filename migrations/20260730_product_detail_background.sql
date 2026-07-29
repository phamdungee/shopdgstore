alter table public.products
  add column if not exists detail_background_image text;

comment on column public.products.detail_background_image is
  'Optional hero background used only on the product detail page. The image column remains the storefront/card image.';

update public.products
set detail_background_image = 'https://cdn.dungicl.store/%E1%BA%A3nh%20s%E1%BA%A3n%20ph%E1%BA%A9m/6249078052071608432.webp'
where (lower(slug) like '%netflix%' or lower(name) like '%netflix%')
  and coalesce(detail_background_image, '') = '';
