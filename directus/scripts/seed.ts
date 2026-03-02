import { v4 as uuid } from 'uuid'
import { mapAsync } from './../utilities/mapAsync'
import login from './login'

const directusURL = 'http://localhost:8055'

type CreatedItem = {
  id: string
}

async function createItem<T extends CreatedItem>(
  collection: string,
  data: Record<string, unknown>,
  token: string,
): Promise<T> {
  const response = await fetch(`${directusURL}/items/${collection}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })

  const json = await response.json()

  if (!response.ok) {
    throw new Error(
      `Failed creating ${collection} (${response.status}): ${JSON.stringify(json)}`,
    )
  }

  return json.data as T
}

const seed = async (): Promise<void> => {
  const token = await login()

  const relationshipAIDs: string[] = []
  const relationshipBIDs: string[] = []
  const nestedArrayIDs: string[] = []
  const arrayIDs: string[] = []
  const hasManyRelationsIDs: string[] = []
  const relationToOneIDs: string[] = []

  // Create 30 relationship-b docs
  await mapAsync([...Array(30)], async () => {
    const doc = await createItem<CreatedItem>(
      'relationshipB',
      {
        text: uuid(),
      },
      token,
    )

    console.info(`Relationship B created with ID ${doc.id}`)
    relationshipBIDs.push(doc.id)
  })

  // Create 30 relationship-a docs
  await mapAsync([...Array(30)], async () => {
    const randomRelationshipBID = relationshipBIDs[Math.floor(Math.random() * relationshipBIDs.length)]

    const doc = await createItem<CreatedItem>(
      'relationshipA',
      {
        title: uuid(),
        relation: randomRelationshipBID,
      },
      token,
    )

    console.info(`Relationship A created with ID ${doc.id}`)
    relationshipAIDs.push(doc.id)
  })

  // Create an array with 10 rows, each having 10 nested rows
  await mapAsync([...Array(10)], async () => {
    const randomRelationshipAID = relationshipAIDs[Math.floor(Math.random() * relationshipAIDs.length)]

    const result = await createItem<CreatedItem>(
      'nested_arrays',
      {
        text: uuid(),
        relation: randomRelationshipAID,
      },
      token,
    )

    nestedArrayIDs.push(result.id)
  })

  await mapAsync([...Array(10)], async () => {
    const { id } = await createItem<CreatedItem>(
      'arrays',
      {
        text: uuid(),
        nestedArrays: {
          create: nestedArrayIDs.map((nestedArrayID) => ({
            arrays_id: '+',
            nested_arrays_id: { id: nestedArrayID },
          })),
        },
      },
      token,
    )

    arrayIDs.push(id)
  })

  await mapAsync([...Array(10)], async () => {
    const randomRelationshipAID = relationshipAIDs[Math.floor(Math.random() * relationshipAIDs.length)]

    const { id } = await createItem<CreatedItem>(
      'hasManyRelations',
      {
        text: uuid(),
        relationToMany: [{ collection: 'relationshipA', item: { id: randomRelationshipAID } }],
      },
      token,
    )

    hasManyRelationsIDs.push(id)
  })

  await mapAsync([...Array(10)], async () => {
    const randomRelationshipAID = relationshipAIDs[Math.floor(Math.random() * relationshipAIDs.length)]

    const { id } = await createItem<CreatedItem>(
      'relationToOne',
      {
        text: uuid(),
        relation: randomRelationshipAID,
      },
      token,
    )

    relationToOneIDs.push(id)
  })

  const nestedGroup = await createItem<CreatedItem>(
    'nestedGroups',
    {
      text: uuid(),
    },
    token,
  )

  const group = await createItem<CreatedItem>(
    'groups',
    {
      text: uuid(),
      nestedGroups: nestedGroup.id,
    },
    token,
  )

  // Create doc for performance testing
  const doc = await createItem<CreatedItem>(
    'documents',
    {
      title: uuid(),
      group: group.id,
      array: {
        create: arrayIDs.map((id) => ({
          documents_id: '+',
          arrays_id: { id },
        })),
      },
      relation: {
        create: relationshipAIDs.map((id) => ({
          documents_id: '+',
          relationshipA_id: { id },
        })),
      },
      blocks: [
        ...relationToOneIDs.map((id) => ({
          collection: 'relationToOne',
          item: id,
        })),
        ...hasManyRelationsIDs.map((id) => ({
          collection: 'hasManyRelations',
          item: id,
        })),
      ],
    },
    token,
  )

  console.info(`Performance testing document created with ID ${doc.id}`)
}

seed()
