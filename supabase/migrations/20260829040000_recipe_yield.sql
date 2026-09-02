-- Batch yield, so a recipe can say what it actually makes.
--
-- The workbook holds three numbers per recipe and derives the fourth:
--
--   DESIRED BATCH SIZE (LB)  what you want to make          -> batch_size
--   BATCH YEILD              what comes out of the kettle    -> batch_yield
--   BATCH TOTAL (INGR WEIGHT) sum of the ingredient weights  -> derived
--   YEILD                     (yield - desired) / desired    -> derived
--
-- Boiled quinoa is the clearest case: 150 lb of ingredients yields 450 lb,
-- a +200% gain, because the grain takes up water. A stew that cooks down is
-- the same arithmetic with a negative answer. Storing the two typed numbers
-- and deriving the percentage means the percentage can never disagree with
-- them, which is what happens when all three are typed.

alter table public.purchasing_recipes
  add column if not exists batch_yield numeric;

comment on column public.purchasing_recipes.batch_size is
  'DESIRED BATCH SIZE - what you set out to make, in the recipe uom.';

comment on column public.purchasing_recipes.batch_yield is
  'BATCH YEILD - what actually comes out. Null means yield is unknown.';

-- Seed the yield from the batch size so nothing reads as a 100% loss on the
-- day this runs; a real yield is typed in per recipe afterwards.
update public.purchasing_recipes
set batch_yield = batch_size
where batch_yield is null
  and batch_size is not null;


-- ------------------------------------------------------------
-- How a recipe is called out to the floor.
--
-- Some things are called in batches ("run three kettles of stew") and some in
-- units ("450 lb of rice"). The distinction is the recipe's own, not the
-- scheduler's, so it is stored here and the schedule and batch sheet both
-- read it rather than each guessing.

alter table public.purchasing_recipes
  add column if not exists call_basis text not null default 'unit'
    check (call_basis in ('batch', 'unit', 'case'));

comment on column public.purchasing_recipes.call_basis is
  'batch = whole kettles; unit = each; case = cases.';

-- A recipe with a real batch size is one that gets run as batches.
update public.purchasing_recipes
set call_basis = 'batch'
where batch_size is not null
  and batch_size > 0;

-- Anything measured in each/case is called that way rather than by weight.
update public.purchasing_recipes
set call_basis = case
  when upper(coalesce(uom, '')) in ('CS', 'CASE') then 'case'
  else 'unit'
end
where call_basis <> 'batch';


-- ------------------------------------------------------------
-- Desired batch and batch yield, lifted from MASTER FRESH 08.13.2026.
--
-- 199 of the workbook's 199 recipe blocks matched a recipe by name.
-- Only rows that have not already been given a yield are written, so this is
-- safe to re-run and will never overwrite a number someone has since typed.

update public.purchasing_recipes r
set batch_size  = coalesce(v.desired, r.batch_size),
    batch_yield = coalesce(v.produced, r.batch_yield)
from (values
  ('567ff519-2c21-42b8-aa4d-4697b7563bdd'::uuid, 0, null),
  ('23fe1de3-ab3a-4418-ae68-19a89c21aa71'::uuid, 0, null),
  ('728e46ed-4322-4b26-9083-ad8cb679615a'::uuid, 0, null),
  ('7e4999f7-f7ce-4946-83ee-66d6acdbe621'::uuid, 0, null),
  ('f3e9df4f-ecb0-4ed5-ad67-34bdf14d087a'::uuid, 0, null),
  ('797d9125-f15b-4ec5-88f2-2e370a495402'::uuid, 0, null),
  ('b1b25e15-a7bf-40da-95c2-fd19ea15005d'::uuid, 0, null),
  ('59a7d1b0-308c-49fa-9fa5-9d7bb4e5c5b0'::uuid, 0, null),
  ('a2fc8209-7081-4be7-8bcc-efe31265585d'::uuid, 0, null),
  ('14c0564f-2681-4296-8034-f6c1bf1d2241'::uuid, 0, null),
  ('41291446-a0c3-45f4-9e0c-8f21d0cc5061'::uuid, 0, null),
  ('93c04b48-6e3c-4b11-82c4-6a90005f18d8'::uuid, 0, null),
  ('2ae4f597-c465-4224-8d12-fb60c4b2bbc9'::uuid, 0, null),
  ('9a35374b-714b-499f-b96a-33369013a751'::uuid, 0, null),
  ('7803d2e3-ed65-45de-984c-519afaee38ef'::uuid, 0, null),
  ('7c008d0e-2db5-4ba7-a594-6887fc62d571'::uuid, 0, null),
  ('dba7857a-904a-42d2-ad59-66e283738627'::uuid, 0, null),
  ('ad175f4f-9f5d-4d5c-8c94-bd1321c7e80d'::uuid, 0, null),
  ('4f161d92-2581-48d2-8e8a-6840fd5593f0'::uuid, 0, null),
  ('df3e20ff-3abd-46af-9f3a-c2578dbf6dfb'::uuid, 0, null),
  ('369bdaff-7616-43be-8bfb-835196fbeb7a'::uuid, 0, null),
  ('cb448e04-8b72-4941-91c3-d358da6b449b'::uuid, 0, null),
  ('07fbc3db-2a5f-4de7-b710-3a3f52ce3d11'::uuid, 0, null),
  ('91a179fb-15f5-4c13-8483-3424c16a340f'::uuid, 0, null),
  ('75d5256a-7113-421a-b217-c0827daa717b'::uuid, 0, null),
  ('1ec7d2d7-2ebf-4ddf-81b0-a5891ad9d611'::uuid, 0, null),
  ('33274c86-7e1c-4e96-8946-95d8a723fa32'::uuid, 0, null),
  ('6a5abccb-7fe0-4de2-9e3c-b64efa37c55d'::uuid, 0, null),
  ('bef846f3-7791-45dd-9cc3-0fbf2fe9a042'::uuid, 0, null),
  ('92683258-e03b-4f9b-a9fb-e6b49b0732ea'::uuid, 0, null),
  ('2c2aec2b-b65f-49a8-987e-b5d959c7f94a'::uuid, 0, null),
  ('78cd269b-29e4-45dc-8f1e-a718930dea23'::uuid, 0, null),
  ('f9d19dec-0251-4a62-b516-0434c82086db'::uuid, 0, null),
  ('91852db6-7521-498c-af4a-9386c0f3120e'::uuid, 0, null),
  ('e2026520-2336-4354-8dac-1e4f90562ad0'::uuid, 0, null),
  ('1ebcc902-5abf-4268-9ef9-791c7e4555ae'::uuid, 0, null),
  ('504fce3a-e3d8-4cc8-b2f9-62babf454620'::uuid, 0, null),
  ('ead1b2bf-59e5-4f1b-a5ff-63459edf03d8'::uuid, 0, null),
  ('8e99a492-9859-4622-80af-9c289b6ecb28'::uuid, 0, null),
  ('5813f82d-4067-4298-b401-b46ae4d96e1e'::uuid, 0, null),
  ('0ae28011-0503-4139-9900-216a3a42e7f5'::uuid, 0, null),
  ('fa0d3313-e0c7-455a-8904-8be1950cb724'::uuid, 0, null),
  ('2bd85610-f222-436b-9dc3-2375f7e46f90'::uuid, 0, null),
  ('08930bda-14dd-490b-abae-fe9c33e2dcd5'::uuid, 0, null),
  ('41aa16e8-608d-42d7-bd41-d61d446a3a75'::uuid, 0, null),
  ('98bcdfde-9e56-41b9-9ec5-fdd39968e193'::uuid, 0, null),
  ('38b9d3dd-edab-4856-8a25-c69429d47fb6'::uuid, 0, null),
  ('d7ae3e39-a7d0-44a5-b0e9-165f6d2b7840'::uuid, 0, null),
  ('903ee904-f217-4286-8afd-7877d71808f2'::uuid, 0, null),
  ('7952455b-0b00-482c-9152-9f7ad99a6578'::uuid, 0, null),
  ('35d366ff-1a17-417a-b0d1-f8ac086a49f9'::uuid, 0, null),
  ('e1c4e6ee-64d7-4b23-aaca-113d786e49fe'::uuid, 0, null),
  ('5ba1a346-be22-4aec-a28c-1371520cf4c2'::uuid, 0, null),
  ('ff53d2ed-d022-48c4-a129-77f0a5595365'::uuid, 0, null),
  ('48a843a2-30eb-4660-a2d4-617ffd950e80'::uuid, 0, null),
  ('1c2a0494-3a5f-4c03-ac38-4b8ae17aeecf'::uuid, 0, null),
  ('40e6303d-645f-4c31-b12c-9a5732943613'::uuid, 0, null),
  ('cd654044-e8d1-47d3-a1ac-587d29d489c7'::uuid, 0, null),
  ('2ccdbb78-2da4-4ed9-8044-7a4ab7309ecd'::uuid, 0, null),
  ('be80bc56-2dc3-4d6f-b154-2346366a8673'::uuid, 0, null),
  ('70f98003-1525-46a3-b68e-a17cd223ce61'::uuid, 0, null),
  ('5a1215d2-7658-4d13-ba86-3125c18079ef'::uuid, 0, null),
  ('7ce0509e-31c7-42b5-bfe3-8555e56db2ca'::uuid, 0, null),
  ('e9a2487b-ea4a-47b1-9b6b-f8d5c5f59ed1'::uuid, 0, null),
  ('d3557aaf-af70-433c-bfdc-a32fea95be20'::uuid, 0, null),
  ('12d7fd4e-4ac6-4505-baa9-f12dd4c9fda2'::uuid, 0, null),
  ('81670e11-3437-4172-a68e-fc6f24ffc5e1'::uuid, 0, null),
  ('5364be11-bbfc-45b2-aba8-c3c82c4b8f5d'::uuid, 0, null),
  ('e2450b7f-eb81-47ab-ae9f-c0e7281a4b69'::uuid, 250, 250),
  ('a3a0a570-7ce6-47b4-8d3f-5b14e1caf27c'::uuid, 250, 250),
  ('132c85ce-0280-4082-9e3a-a2028821fd77'::uuid, 250, 250),
  ('1d84a5cd-bc0a-44b2-8cc1-8b9cf0e159cd'::uuid, 250, 250),
  ('6e4b0077-efcf-4f70-a4d1-c5f3f26f8799'::uuid, 250, 250),
  ('fc77999b-a804-48bc-bba0-97c5e81a3528'::uuid, 250, 250),
  ('6121050a-e493-4330-a497-4e1c87d012f8'::uuid, 250, 250),
  ('8a32ccbb-561f-4364-8345-a60fa0d92451'::uuid, 250, 250),
  ('e0a76706-72f1-48db-9880-a8ce067f4017'::uuid, 250, 250),
  ('4f5c0729-1f49-48a1-90c7-ef843972c490'::uuid, 250, 250),
  ('89f9730c-a1ae-4f1a-9a43-757ba844040e'::uuid, 250, 250),
  ('2207f9ad-b317-4f37-83bf-97f33f1adc2b'::uuid, 250, 250),
  ('ac2746f3-57eb-4653-8079-e43ed2faef6d'::uuid, 250, 250),
  ('67d233bc-0c71-4001-87b9-a8859c78e114'::uuid, 250, 250),
  ('73074537-80f8-405c-8507-deaaf11bd50d'::uuid, 250, 250),
  ('3b70ff55-58e9-4985-a5ad-f1ea2198a34f'::uuid, 250, 250),
  ('f594d7d1-8e98-4786-9d6d-043beb6600ff'::uuid, 250, 250),
  ('28770c91-dce9-455c-b583-b9faaf133ba5'::uuid, 250, 250),
  ('e3aec2dd-5751-4bf4-a304-d2e8c04b2512'::uuid, 250, 250),
  ('715e7560-80fd-4136-8bd1-79373f33a29a'::uuid, 250, 250),
  ('e04f9eaa-b3f9-4a54-9671-49915e664d7a'::uuid, 250, 250),
  ('848c8c3f-84b3-486c-b025-ae38f2cc8e0e'::uuid, 250, 250),
  ('83ad1cde-0fbe-4ff5-861d-2cab9c419a62'::uuid, 250, 250),
  ('48d2d656-89f0-4632-89bf-8ceb998bc0a2'::uuid, 250, 250),
  ('c0b26a8c-bf57-48cb-b3ff-6aa4984d5602'::uuid, 250, 250),
  ('4ad0e81e-7125-49bf-80bf-d10e788f65ac'::uuid, 250, 250),
  ('af841e02-c581-40a5-a446-75adc572716f'::uuid, 250, 250),
  ('664d789e-5c29-4d3e-8559-5c942d0294de'::uuid, 150, 450),
  ('4c710eeb-5399-449e-a917-9b8b38c70d98'::uuid, 209.3333333333334, 400),
  ('d8ead2ae-a5f5-470c-a49e-679a4524237a'::uuid, 209.333333333333, 400),
  ('8df4a921-fafd-4731-b80f-1dbd8d612b11'::uuid, 256.75000000000006, 513.5000000000001),
  ('62b002f5-b0ea-492b-aee0-e4cc3cba3be3'::uuid, 150, 300),
  ('78d66f3f-ddc8-4dba-a4f6-9630b3c294b4'::uuid, 315.3602362204724, 290),
  ('0d292253-43e3-4edd-9892-66eefab993d9'::uuid, 100, 80),
  ('14f5b52c-c079-4215-bfd2-436d1690bdc5'::uuid, 100, 84),
  ('de4838f0-ed23-4931-88d9-4038af224073'::uuid, 111.85199999999999, 90),
  ('4ff89629-0bfe-47a5-82a3-07ab4c722d49'::uuid, 100, 100),
  ('bdb7477c-73c5-4041-8045-f50d6ba33d09'::uuid, 100, 88),
  ('585d6a80-34ed-4281-ae39-3ae0f6bbeba1'::uuid, 100, 57),
  ('232e7c23-06b1-469e-8e34-874d5af74af5'::uuid, 100, 79.065),
  ('d945ede3-b273-4bff-8ad4-8c3d434dea61'::uuid, 1, 0.95),
  ('80ee0a73-a45a-4959-9009-98b305a0ead9'::uuid, 1, 0.95),
  ('0c388a44-6f3a-43fd-a344-81cbd0a635fc'::uuid, 104, 104),
  ('9816ca8b-667e-4389-b206-f380fff72849'::uuid, 8, 7.34),
  ('9f42553b-1039-42d9-86a2-b76f5034250a'::uuid, 118.73333333333332, 118.73333333333332),
  ('1924b806-7c94-4007-b4f9-28da0a1d1329'::uuid, 8, 7.34),
  ('175b5f34-8011-44ff-b66f-f6fe2a8ea7e3'::uuid, 242.32, 176),
  ('06310f25-81f9-4b92-becb-bd0038eec343'::uuid, 257.64, 200),
  ('306023f6-039c-4478-b05f-de6abfead653'::uuid, 117.74, 117.74),
  ('6b368c2e-ce42-4175-ae61-4060783d0238'::uuid, 8, 7.34),
  ('61d8390a-ad8d-4304-865b-c36066c819c5'::uuid, 117.74, 117.74),
  ('1186fa8b-42fd-428e-a138-fc01ce89df58'::uuid, 8, 7.34),
  ('83ddac33-e3ce-41b3-8d42-775f63fdc0d9'::uuid, 110.67567567567566, 110.67567567567566),
  ('48e287f6-d4d1-4ba8-9ff7-38706c71ffa2'::uuid, 8, 7.34),
  ('07b783f5-b17c-4b5b-afbd-55e313feec01'::uuid, 130, 130),
  ('236e913d-6c61-4644-b262-1daaf8e559d2'::uuid, 8, 7.3),
  ('096e74ed-3ba7-4efa-aa00-5ec065ab359c'::uuid, 119.71, 105),
  ('e1482b9b-3711-4a2e-a451-3a9692c8d84a'::uuid, 158.6, 158.6),
  ('cf43fb85-fa73-47bc-88ec-6969eb3fcf0f'::uuid, 1, 0.92),
  ('d888fc72-c8ca-466b-9bd2-0b0ef970f7c3'::uuid, 200, 156),
  ('0032bb98-a11d-49d8-a0ee-7207595bc6b0'::uuid, 150, 300),
  ('4382c351-7941-4fcf-b84c-ae6e6844f691'::uuid, 200, 178),
  ('e1e5cc62-ee08-45d7-a3fa-e222e6beb60f'::uuid, 256.1530434782608, 184),
  ('bad9a8c0-6e94-44d6-8f84-2dcd87350e07'::uuid, 117.74, 117.74),
  ('ad01eb0d-b91d-476a-9536-790533350549'::uuid, 8, 7.34),
  ('52d640d2-2a04-49ca-ad55-b784111f5a95'::uuid, 117.74, 117.74),
  ('6a3a0010-82c1-4d00-8fe7-8f75b24c10b9'::uuid, 8, 7.74),
  ('2151a08f-03bc-4f00-8e17-40a2c4423d6f'::uuid, 117.74, 117.74),
  ('4e3a7f6d-3e3d-49e7-9adb-ee828aa67f75'::uuid, 8, 7.34),
  ('046c9c71-6b9e-4f76-b8dc-fa886ab5eafb'::uuid, 100, 100),
  ('a05dc580-3ef2-4170-b9fd-38da02ff4994'::uuid, 70, 70),
  ('4b6584ef-b000-4ee9-bb46-f76f2539173d'::uuid, 140, 128.8),
  ('dd21dfbd-ffd8-4a37-8c1e-7eb39daca2f9'::uuid, 8, 7.34),
  ('07fb4c82-b43d-4b88-bf10-810efa6f1e09'::uuid, 316.5, 304),
  ('fa1170cc-584d-49f5-b12d-a7dd2513d46e'::uuid, 156.1, 135),
  ('52063ec0-efa6-44a0-9a8a-b7e72616a692'::uuid, 10, 9),
  ('a6991a6d-2f31-42ff-8b93-c995f0054417'::uuid, 1, 0.92),
  ('defc8431-d8ac-44a1-a47d-13c59bd9d897'::uuid, 1, 0.92),
  ('978e8c3b-b726-4ead-803c-4f72cddbc696'::uuid, 1, 0.92),
  ('d3ca3baa-3a98-486b-9865-3a04a0bd205e'::uuid, 100, 100),
  ('7a3313bd-1a32-44b9-b492-731300a8579f'::uuid, 400, 400),
  ('3408ddb4-4323-413d-b333-da775050842e'::uuid, 350, 350),
  ('25ae9486-d5d7-4c4a-8ef5-8c40d93d6d86'::uuid, 350, 350),
  ('afd079ec-9bf2-479b-b578-ee35a32884be'::uuid, 50, 50),
  ('f439b3b2-4523-4a6b-9ea5-9328ca434d47'::uuid, 350, 350),
  ('724f2756-24b4-4e7f-835a-d85a7b5daad5'::uuid, 50, 50),
  ('9e4cbf7f-02a5-4bda-866d-77b76b600153'::uuid, 350, 350),
  ('3709251b-a86f-40a9-be75-4b5dab158336'::uuid, 50, 50),
  ('80d7f16e-8867-4f4e-a5dc-11fbbe76db73'::uuid, 375, 375),
  ('282d698f-3c05-4d2e-8316-a6dfdabd9f71'::uuid, 1, 0.95),
  ('dee9f645-b96a-4e7f-b75d-cd7994d8ad1f'::uuid, 1, 0.95),
  ('c65bfba2-264d-4843-86de-881d6310fa63'::uuid, 1, 0.95),
  ('eae4c04e-6e66-44dc-8f04-2e8e696b6a68'::uuid, 1, 0.95),
  ('80f61677-2a02-4a97-927e-108e0aabed67'::uuid, 350, 350),
  ('4dbb0d1f-da03-4db9-81ca-c9ae2c829fe0'::uuid, 100, 100),
  ('3dea9957-91bd-4b5e-b602-60fa8b4d72d2'::uuid, 350, 350),
  ('44f03b4c-ae6d-4238-9232-6779cfa4e56b'::uuid, 350, 350),
  ('281c7768-1137-49c7-b8ee-eb1897642e58'::uuid, 350, 350),
  ('422668b6-db70-4f1a-9e72-6174a273202a'::uuid, 21.83, 21.83),
  ('4748f7c5-5fc0-4618-815d-2adb9357414f'::uuid, 350, 350),
  ('d3b1a9f9-cbd0-4a8f-8678-ca9879c66e60'::uuid, 120, 120),
  ('e26d09ae-295b-4be7-9d4c-e59684065e4f'::uuid, 18.44, 18.44),
  ('e1c1d909-d75e-44f1-a0c2-2395fc3e46ef'::uuid, 50, 35.5),
  ('cc115b26-59ec-4935-b0d5-c14f83976488'::uuid, 50, 35.5),
  ('1b3cdf00-cb82-4f0f-9157-1b0964320cb0'::uuid, 25, 13.8),
  ('4986b035-acc9-4827-8694-9c12172a885e'::uuid, 27, 25),
  ('625576c4-795c-45b2-91ee-190d820ca626'::uuid, 5, 3.2),
  ('3a95d00f-7703-4b0a-a037-191032944507'::uuid, 50, 35),
  ('091065e8-5ea8-457e-8620-0c1823a1d1dc'::uuid, 38, 26),
  ('6f0989dd-fa7a-4e28-ab73-186cf9f015d3'::uuid, 38, 30),
  ('b2342d52-1745-4e06-8a83-5301096aeb6b'::uuid, 40, 34),
  ('fbf649e0-d39e-4958-bb41-7abbef27de9d'::uuid, 40, 38),
  ('b9621738-db42-49dd-be5b-bbb12ff59066'::uuid, 22, 21),
  ('a1ab2139-7042-4a18-bdf9-ff9eaaca6b6a'::uuid, 40, 38),
  ('29c8c52b-1dde-41ef-9b6f-7963f33bf8ee'::uuid, 40, 38),
  ('7cd53e38-56e7-4aac-954e-1e746ceaaaf2'::uuid, 50, 35),
  ('c0cfe699-8dc4-402b-8e96-a1473313d661'::uuid, 1, 0.43),
  ('38e123a7-5a5c-489d-97ba-14ad265ab7eb'::uuid, 50, 42),
  ('91b804e4-c051-4a94-b9e9-0a261e3cdb1c'::uuid, 22, 57),
  ('f09fb736-95d6-41cb-87f1-d297f6b98c4f'::uuid, 22, 18.5),
  ('b5b4a045-5f4e-4600-9259-e937bcee538b'::uuid, 22, 16),
  ('657a7ad0-ee9f-42fa-bfff-0ac852a25df5'::uuid, 22, 21.2),
  ('816136af-9f02-4a9b-b174-429c9e1d628d'::uuid, 22, 13.8),
  ('81d1eedc-e429-48f9-b3f5-905aae96668e'::uuid, 22, 13.8),
  ('954a8b9e-a3d9-4ef3-aa91-ce1d3f91e6c9'::uuid, 1, 0.6),
  ('c3e968f7-35b0-467f-8fda-e38f0e5ef76a'::uuid, 1, 0.9),
  ('523d1b02-9490-4c35-8165-4decbfc35a63'::uuid, 1, 0.9),
  ('5cfe2adf-c8bf-472a-a5b3-646d6fa96c71'::uuid, 1, 0.9),
  ('a411df0a-5200-4ce4-ad6a-18d96646e0e0'::uuid, 36, 12),
  ('b39ea43c-fd03-49ed-9bf6-7e39c35c93d8'::uuid, 36, 33),
  ('380045d3-5cc3-4d09-98ff-841b672f321b'::uuid, 36, 12)
) as v(id, desired, produced)
where r.id = v.id
  and r.batch_yield is not distinct from r.batch_size;

-- ------------------------------------------------------------
-- The unit a line's calculated amount is PRINTED in.
--
-- Separate from `uom`, which is the unit the recipe quantity was written in.
-- A line can be recorded in pounds and still print in ounces, because what a
-- person can weigh depends on how much of it there is - 0.31 lb of oregano is
-- unweighable, 4.96 oz is not. Which lines want that is a judgement call, so
-- it is set by hand per line rather than by a threshold rule.
--
-- Null means "same as uom".

alter table public.purchasing_recipe_lines
  add column if not exists display_uom text
    check (display_uom is null or display_uom in ('LB', 'OZ', 'G', 'KG', 'EA', 'CS'));

comment on column public.purchasing_recipe_lines.display_uom is
  'Unit the calculated amount prints in. Null = same as uom.';
