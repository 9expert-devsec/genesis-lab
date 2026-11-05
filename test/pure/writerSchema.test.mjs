import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writerFieldErrors, writerSchema } from '@/lib/schemas/writer';
import { WRITER_PLATFORMS, isHttpUrl, normalizeWriter, slugFromName } from '@/lib/writers/writerFields';

const base = { slug: 'chalaivate', displayName: 'อ.เวท' };
const parse = (patch) => writerSchema.safeParse({ ...base, ...patch });
const errorOn = (patch, field) => {
  const res = parse(patch);
  assert.equal(res.success, false, `expected a refusal on ${field}`);
  assert.ok(writerFieldErrors(res.error)[field], `no message on ${field}`);
};

test('CONTROL: a minimal writer parses, with every default filled in', () => {
  const res = parse({});
  assert.equal(res.success, true);
  assert.deepEqual(res.data, {
    slug: 'chalaivate',
    displayName: 'อ.เวท',
    type: 'person',
    role: '',
    bio: '',
    avatarPublicId: '',
    socialLinks: [],
    sections: { experience: [], education: [], certifications: [], recognition: [] },
    instructorId: null,
  });
});

for (const slug of ['chalaivate', '9expert-academy', 'a', 'a1-b2-c3']) {
  test(`slug accepted: ${slug}`, () => assert.equal(parse({ slug }).success, true));
}

for (const slug of ['Upper', 'has space', 'ชไลเวท', '-lead', 'trail-', 'double--dash', 'under_score', 'a/b', '']) {
  test(`slug refused: ${JSON.stringify(slug)}`, () => errorOn({ slug }, 'slug'));
}

test('a name that is only whitespace is refused', () => errorOn({ displayName: '   ' }, 'displayName'));

test('an unknown type is refused', () => errorOn({ type: 'team' }, 'type'));

test('every platform in the vocabulary is accepted, in the order given', () => {
  const socialLinks = WRITER_PLATFORMS.map((platform) => ({ platform, url: `https://example.com/${platform}` }));
  const res = parse({ socialLinks });
  assert.equal(res.success, true);
  assert.deepEqual(res.data.socialLinks.map((l) => l.platform), [...WRITER_PLATFORMS]);
});

test('a platform outside the enum is refused', () => {
  errorOn({ socialLinks: [{ platform: 'myspace', url: 'https://example.com' }] }, 'socialLinks');
});

for (const url of ['javascript:alert(1)', 'ftp://example.com', 'example.com', 'data:text/html,x', '']) {
  test(`a social url is refused: ${JSON.stringify(url)}`, () => {
    errorOn({ socialLinks: [{ platform: 'website', url }] }, 'socialLinks');
  });
}

test('http and https are both accepted', () => {
  assert.equal(isHttpUrl('http://example.com'), true);
  assert.equal(isHttpUrl('https://example.com/a?b=1'), true);
});

test('section items are trimmed and the empty ones dropped, keeping order', () => {
  const res = parse({ sections: { experience: ['  one ', '', '   ', 'two'], recognition: ['  '] } });
  assert.equal(res.success, true);
  assert.deepEqual(res.data.sections.experience, ['one', 'two']);
  assert.deepEqual(res.data.sections.recognition, []);
  assert.deepEqual(res.data.sections.education, []);
});

test('`isDefault` cannot be set through the schema: it is stripped', () => {
  const res = parse({ isDefault: true });
  assert.equal(res.success, true);
  assert.equal('isDefault' in res.data, false);
});

test('`isActive` stays absent when not sent, so a save cannot reactivate a writer', () => {
  assert.equal('isActive' in parse({}).data, false);
  assert.equal(parse({ isActive: false }).data.isActive, false);
});

test('an avatar must sit in the writers folder', () => {
  assert.equal(parse({ avatarPublicId: 'writers/abc123' }).success, true);
  errorOn({ avatarPublicId: 'avatars/abc123' }, 'avatarPublicId');
  errorOn({ avatarPublicId: 'writers/../secret' }, 'avatarPublicId');
  errorOn({ avatarPublicId: 'writers/a,w_9999' }, 'avatarPublicId');
  errorOn({ avatarPublicId: 'https://evil.example/x.png' }, 'avatarPublicId');
});

test('instructorId takes an ObjectId string, or nothing', () => {
  assert.equal(parse({ instructorId: '68da60bb87a228e4c5f4c2c7' }).success, true);
  assert.equal(parse({ instructorId: '' }).data.instructorId, null);
  assert.equal(parse({ instructorId: null }).data.instructorId, null);
  errorOn({ instructorId: 'not-an-id' }, 'instructorId');
});

test('slugFromName gives a valid slug from Latin text, and nothing from Thai', () => {
  assert.equal(slugFromName('  9Expert Academy! '), '9expert-academy');
  assert.equal(slugFromName('ชไลเวท'), '');
});

test('normalizeWriter turns a missing field into empty, because .lean() applies no defaults', () => {
  const writer = normalizeWriter({ _id: 'x', slug: 's', displayName: 'n' });
  assert.deepEqual(writer.socialLinks, []);
  assert.deepEqual(writer.sections.experience, []);
  assert.deepEqual(writer.sections.recognition, []);
  assert.equal(writer.type, 'person');
  assert.equal(writer.isActive, true);
  assert.equal(writer.isDefault, false);
  assert.equal(writer.instructorId, null);
  assert.equal(normalizeWriter(null), null);
});
