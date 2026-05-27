type WebApplication = {
  "@type": "WebApplication"
  name: string
  url: string
  description?: string
  applicationCategory?: string
  operatingSystem?: string
  browserRequirements?: string
}

type Organization = {
  "@type": "Organization"
  name: string
  url: string
  logo?: string
  description?: string
  sameAs?: string[]
}

type BreadcrumbItem = {
  name: string
  url: string
}

type BreadcrumbList = {
  "@type": "BreadcrumbList"
  items: BreadcrumbItem[]
}

type JsonLdData = WebApplication | Organization | BreadcrumbList

function buildJsonLd(data: JsonLdData): Record<string, unknown> {
  if (data["@type"] === "BreadcrumbList") {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: data.items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        item: item.url,
      })),
    }
  }

  const { "@type": type, ...rest } = data
  return {
    "@context": "https://schema.org",
    "@type": type,
    ...rest,
  }
}

type JsonLdProps = {
  data: JsonLdData
}

export function JsonLd({ data }: JsonLdProps) {
  const json = buildJsonLd(data)

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  )
}
